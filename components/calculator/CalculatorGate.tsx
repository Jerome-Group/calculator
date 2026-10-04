"use client";
import { useEffect, useState } from "react";
import Calculator from "./Calculator";
import {
  initializeAccount,
  forgetAccount,
  hasVolatileWorkspace,
  sessionWorkspace,
} from "@/lib/calculator/sync";
import { download } from "@/lib/calculator/storage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
export default function CalculatorGate() {
  const [ready, setReady] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [leaveOpen, setLeaveOpen] = useState(false);
  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!hasVolatileWorkspace()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    initializeAccount()
      .then((user) => {
        setName(user.name);
        setReady(true);
      })
      .catch((e) => setError(e.message));
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, []);
  if (!ready)
    return (
      <main className="loading-screen">
        <h1>Calculator</h1>
        <p>{error || "Opening your workspace…"}</p>
        {error && (
          <a
            className="primary"
            href="/signin-with-chatgpt?return_to=%2F"
            target="_top"
          >
            Sign in with ChatGPT
          </a>
        )}
      </main>
    );
  return (
    <>
      <div className="account-strip">
        <span>{name}</span>
        <a
          href="/signout-with-chatgpt?return_to=%2F"
          target="_top"
          onClick={(event) => {
            if (hasVolatileWorkspace()) {
              event.preventDefault();
              setLeaveOpen(true);
              return;
            }
            forgetAccount();
          }}
        >
          Sign out
        </a>
      </div>
      <Calculator />
      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Work kept only in this tab</DialogTitle>
            <DialogDescription>
              Your latest changes are kept only in this tab. Export a backup
              before signing out.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              className="primary"
              onClick={() => setLeaveOpen(false)}
            >
              Keep working
            </button>
            <button
              type="button"
              onClick={() => {
                const state = sessionWorkspace();
                if (state)
                  download(
                    "calculator-backup.json",
                    JSON.stringify(state, null, 2),
                  );
              }}
            >
              Export backup
            </button>
            <a
              href="/signout-with-chatgpt?return_to=%2F"
              target="_top"
              className="danger"
              onClick={() => forgetAccount()}
            >
              Sign out anyway
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
