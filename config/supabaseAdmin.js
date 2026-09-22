const { createClient } = require("@supabase/supabase-js");
const WebSocket = require("ws");

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    realtime: {
      transport: WebSocket,
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

module.exports = supabaseAdmin;



// const { createClient } = require("@supabase/supabase-js");

// const supabaseUrl = process.env.SUPABASE_URL;
// const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// if (!supabaseUrl || !serviceRoleKey) {
//   throw new Error(
//     "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the backend environment."
//   );
// }

// const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
//   auth: {
//     autoRefreshToken: false,
//     persistSession: false,
//   },
// });

// module.exports = supabaseAdmin;
