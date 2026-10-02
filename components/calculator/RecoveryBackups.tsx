"use client";
import { useEffect, useState } from "react";
import { readDrafts } from "@/lib/calculator/drafts";
import { currentAccount } from "@/lib/calculator/sync";
import { download } from "@/lib/calculator/storage";

function currentDrafts() {
  return typeof window === "undefined" ? [] : readDrafts(currentAccount());
}
export default function RecoveryBackups() {
  const [drafts, setDrafts] = useState(currentDrafts);
  useEffect(() => {
    const refresh = () => setDrafts(currentDrafts());
    window.addEventListener("calculator-sync", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("calculator-sync", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  if (!drafts.length) return null;
  return (
    <section className="settings-section">
      <h2>Unsynced copies</h2>
      <p className="small muted">
        These local copies are preserved separately. Export them before clearing
        browser data. If a copy exceeds the combined notebook limit, import it
        into a workspace with room.
      </p>
      <div className="row wrap">
        {drafts.map((draft, index) => (
          <button
            className="subtle"
            key={draft.key}
            onClick={() =>
              download(
                `Calculator-unsynced-copy-${index + 1}.json`,
                JSON.stringify(draft.state, null, 2),
              )
            }
          >
            Export copy {index + 1} · {draft.state.notebooks.length} notebooks
          </button>
        ))}
      </div>
    </section>
  );
}
