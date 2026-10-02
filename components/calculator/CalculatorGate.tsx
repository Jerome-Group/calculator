"use client";
import { useEffect, useState } from "react";
import Calculator from "./Calculator";
import { initializeAccount, forgetAccount } from "@/lib/calculator/sync";
export default function CalculatorGate() {
  const [ready, setReady] = useState(false),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    initializeAccount()
      .then((user) => {
        setName(user.name);
        setReady(true);
      })
      .catch((e) => setError(e.message));
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
          onClick={() => forgetAccount()}
        >
          Sign out
        </a>
      </div>
      <Calculator />
    </>
  );
}
