import { createClient } from "@supabase/supabase-js";

// The build bundles the official SDK into index.html; no third-party CDN is used.
window.TradecraftCloud = { createClient };
