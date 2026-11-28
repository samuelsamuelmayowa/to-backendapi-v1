"""Read-only Windows x64 process inspection; output only telemetry allowlist.

Never prints arbitrary environment values, OTLP headers, or credentials.
Requires permission to read the explicitly supplied process IDs.
"""
import ctypes as c
from ctypes import wintypes as w
import json
import sys

k = c.WinDLL('kernel32', use_last_error=True)
n = c.WinDLL('ntdll')
k.OpenProcess.restype = w.HANDLE
k.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]
k.ReadProcessMemory.argtypes = [w.HANDLE, c.c_void_p, c.c_void_p, c.c_size_t, c.POINTER(c.c_size_t)]
k.CloseHandle.argtypes = [w.HANDLE]
n.NtQueryInformationProcess.argtypes = [w.HANDLE, w.ULONG, c.c_void_p, w.ULONG, c.c_void_p]
allowed = {'PORT', 'NODE_OPTIONS', 'OTEL_NODE_ENABLED_INSTRUMENTATIONS',
           'OTEL_NODE_DISABLED_INSTRUMENTATIONS', 'OTEL_TRACES_EXPORTER',
           'OTEL_EXPORTER_OTLP_PROTOCOL', 'OTEL_EXPORTER_OTLP_TRACES_PROTOCOL',
           'OTEL_TRACES_SAMPLER', 'OTEL_TRACES_SAMPLER_ARG', 'OTEL_SDK_DISABLED',
           'MONITORING_ADVANCED_TRACES_ENABLED', 'MONITORING_ADVANCED_TRACES_INGEST_ENABLED',
           'OTEL_BSP_MAX_EXPORT_BATCH_SIZE', 'OTEL_BSP_MAX_QUEUE_SIZE'}

for pid in map(int, sys.argv[1:]):
    h = k.OpenProcess(0x410, False, pid)  # QUERY_INFORMATION | VM_READ
    if not h:
        raise OSError(c.get_last_error(), 'Cannot open process')
    try:
        def read(address, size):
            buf = c.create_string_buffer(size)
            count = c.c_size_t()
            if not k.ReadProcessMemory(h, address, buf, size, c.byref(count)):
                raise OSError(c.get_last_error(), 'Cannot read process')
            return buf.raw[:count.value]

        def ptr(address):
            return int.from_bytes(read(address, 8), 'little')

        def unicode_string(address):
            return read(ptr(address + 8), int.from_bytes(read(address, 2), 'little')).decode('utf-16-le')

        info = c.create_string_buffer(48)
        if n.NtQueryInformationProcess(h, 0, info, 48, None):
            raise RuntimeError('Cannot query process PEB')
        peb = int.from_bytes(info.raw[8:16], 'little')
        params = ptr(peb + 0x20)
        env_address = ptr(params + 0x80)
        data = b''
        # Read pages until the UTF-16 double terminator; never output the block.
        for offset in range(0, 1024 * 1024, 2):
            data += read(env_address + offset, 2)
            if data.endswith(b'\0\0\0\0'):
                break
        env = dict(entry.split('=', 1) for entry in data.decode('utf-16-le').split('\0') if '=' in entry and not entry.startswith('='))
        # NODE_OPTIONS can contain arbitrary application settings. Report only
        # telemetry preload/startup flags, and whether other options exist.
        options = env.pop('NODE_OPTIONS', None)
        import re
        safe_options = re.findall(r'(?:--require|-r|--import)(?:=|\s+)[^\s]*opentelemetry[^\s]*', options or '')
        result = {'pid': pid, 'cwd': unicode_string(params + 0x38),
                  'environment': {name: env.get(name) for name in sorted(allowed - {'NODE_OPTIONS'})},
                  'NODE_OPTIONS': {'present': options is not None, 'otelPreloads': safe_options, 'otherOptionsPresent': bool(re.sub(r'(?:--require|-r|--import)(?:=|\s+)[^\s]*opentelemetry[^\s]*', '', options or '').strip())},
                  'otlpHeadersConfigured': any(env.get(name) for name in ['OTEL_EXPORTER_OTLP_HEADERS', 'OTEL_EXPORTER_OTLP_TRACES_HEADERS'])}
        print(json.dumps(result))
    finally:
        k.CloseHandle(h)
