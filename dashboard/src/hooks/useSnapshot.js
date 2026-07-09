import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { snapshotPaths } from "../lib/cameras";

/* Live tile image from the private `snapshots` bucket.

   The Pi overwrites the same object about once a second. We sign the path once
   (1 h expiry, re-signed 5 min before it runs out) and on each refresh append a
   cacheNonce so the browser and CDN fetch the new bytes. Each frame is
   preloaded in an Image() and only swapped in after it loads, so the tile does
   not flash. Refreshing stops while the tab is hidden or `live` is false. */

const EXPIRES_S = 3600;
const RESIGN_EARLY_MS = 5 * 60 * 1000;
const MISSING_RETRY_MS = 15_000;

function usePageVisible() {
  const [visible, setVisible] = useState(
    typeof document === "undefined" ? true : document.visibilityState !== "hidden"
  );
  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

async function signFirst(paths) {
  for (const path of paths) {
    const { data, error } = await supabase.storage.from("snapshots").createSignedUrl(path, EXPIRES_S);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return null;
}

export function useSnapshot(cam, { live = true, intervalMs = 1500 } = {}) {
  const [url, setUrl] = useState(null);
  const visible = usePageVisible();
  const signed = useRef({ key: null, url: null, expires: 0 });
  const paths = snapshotPaths(cam);
  const key = paths.join("|");

  useEffect(() => {
    if (!supabase || !key) return undefined;
    let active = true;
    let timer = null;
    let loader = null;

    async function base() {
      const s = signed.current;
      if (s.key === key && s.url && Date.now() < s.expires - RESIGN_EARLY_MS) return s.url;
      const fresh = await signFirst(key.split("|"));
      signed.current = { key, url: fresh, expires: Date.now() + EXPIRES_S * 1000 };
      return fresh;
    }

    async function tick() {
      const b = await base();
      if (!active) return;
      if (!b) {
        // Nothing uploaded yet under any known path. Try again later.
        schedule(MISSING_RETRY_MS);
        return;
      }
      const next = `${b}${b.includes("?") ? "&" : "?"}cacheNonce=${Date.now()}`;
      loader = new Image();
      loader.onload = () => {
        if (!active) return;
        setUrl(next);
        schedule(intervalMs);
      };
      loader.onerror = () => {
        if (!active) return;
        signed.current.expires = 0; // token may be stale or the path moved
        schedule(intervalMs * 4);
      };
      loader.src = next;
    }

    function schedule(ms) {
      if (!active || !live || !visible) return;
      timer = setTimeout(tick, ms);
    }

    // Load one frame even when not live, so a stale or offline tile still
    // shows the last picture. Keep refreshing only while live and visible.
    tick();

    return () => {
      active = false;
      clearTimeout(timer);
      if (loader) { loader.onload = null; loader.onerror = null; }
    };
  }, [key, live, visible, intervalMs]);

  return url;
}
