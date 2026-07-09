import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/* Signed URL for a private storage object (default bucket: best-frames).
   Returns null while loading or on failure, so the caller can show a
   placeholder. */
export function useSignedUrl(path, { bucket = "best-frames", expiresIn = 3600 } = {}) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!path || !supabase) { setUrl(null); return; }
    let active = true;
    (async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
      if (!active) return;
      setUrl(error ? null : data?.signedUrl ?? null);
    })();
    return () => { active = false; };
  }, [path, bucket, expiresIn]);

  return url;
}
