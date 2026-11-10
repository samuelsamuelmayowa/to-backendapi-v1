"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const { createClient } = require("@supabase/supabase-js");
const StudentAccess = require("../model/studentAccess");

const legacyResourceIds = new Map([
  ["splunk", "course:splunk"],
  ["splunk-2026", "course:splunk"],
  ["stock-options", "course:stock-options"],
  ["quiz:power-user", "quiz:power-user"],
  ["quiz:admin", "quiz:admin"],
  ["quiz:splk-2002", "quiz:splk-2002"],
  ["quiz:stock-quiz", "quiz:stock-quiz"],
]);

async function migrate() {
  if (!process.env.DATABASE_URL || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("DATABASE_URL, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are required for this one-time import.");
  }

  await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 8000 });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from("student_access")
    .select("email,full_name,course_id,status,expires_at")
    .in("course_id", [...legacyResourceIds.keys()]);
  if (error) throw error;

  const grouped = new Map();
  for (const row of data || []) {
    const email = String(row.email || "").trim().toLowerCase();
    const resourceId = legacyResourceIds.get(String(row.course_id || "").trim().toLowerCase());
    const expiry = row.expires_at ? Date.parse(row.expires_at) : null;
    if (!email || !resourceId || row.status !== "active" || (expiry !== null && (!Number.isFinite(expiry) || expiry <= Date.now()))) continue;
    const entry = grouped.get(email) || { fullName: row.full_name || email, resourceIds: new Set() };
    entry.resourceIds.add(resourceId);
    grouped.set(email, entry);
  }

  let imported = 0;
  let skippedExisting = 0;
  for (const [email, entry] of grouped) {
    const exists = await StudentAccess.exists({ email });
    if (exists) {
      skippedExisting += 1;
      continue;
    }
    await StudentAccess.create({ email, fullName: entry.fullName, resourceIds: [...entry.resourceIds] });
    imported += 1;
  }

  console.log(`Imported ${imported} student access records; skipped ${skippedExisting} existing Mongo records.`);
}

migrate()
  .catch((error) => {
    console.error("Student-access import failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
