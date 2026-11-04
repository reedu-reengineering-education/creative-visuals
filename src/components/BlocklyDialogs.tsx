"use client";

import * as Blockly from "blockly/core";
import { useState } from "react";
import { create } from "zustand";
import { useT } from "@/lib/i18n";
import Dialog from "./Dialog";

/**
 * Blockly asks with window.prompt / confirm / alert (e.g. the name of a new
 * variable). These show the app's own dialogs instead.
 */
type Ask =
  | { kind: "prompt"; message: string; value: string; done: (v: string | null) => void }
  | { kind: "confirm"; message: string; done: (ok: boolean) => void }
  | { kind: "alert"; message: string; done: () => void };

const useAsk = create<{ ask: Ask | null }>(() => ({ ask: null }));

let installed = false;
export function installBlocklyDialogs() {
  if (installed) return;
  installed = true;
  Blockly.dialog.setPrompt((message, value, done) => useAsk.setState({ ask: { kind: "prompt", message, value, done } }));
  Blockly.dialog.setConfirm((message, done) => useAsk.setState({ ask: { kind: "confirm", message, done } }));
  Blockly.dialog.setAlert((message, done) => useAsk.setState({ ask: { kind: "alert", message, done: () => done?.() } }));
}

export default function BlocklyDialogs() {
  const ask = useAsk((s) => s.ask);
  // a new key per question, so the text field starts with that question's default
  return ask ? <AskDialog key={`${ask.kind}:${ask.message}`} ask={ask} /> : null;
}

function AskDialog({ ask }: { ask: Ask }) {
  const t = useT();
  const [value, setValue] = useState(ask.kind === "prompt" ? ask.value : "");
  const finish = (ok: boolean) => {
    useAsk.setState({ ask: null });
    if (ask.kind === "prompt") ask.done(ok ? value : null);
    else if (ask.kind === "confirm") ask.done(ok);
    else ask.done();
  };

  return (
    <Dialog title={ask.message} onClose={() => finish(false)} closeLabel={t("rename.cancel")}>
      {ask.kind === "prompt" && (
        <input
          className="text-input"
          value={value}
          autoFocus
          maxLength={40}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && finish(true)}
          aria-label={ask.message}
        />
      )}
      <div className="row">
        <button className="primary" onClick={() => finish(true)}>
          {t("dialog.ok")}
        </button>
        {ask.kind !== "alert" && (
          <button className="ghost" onClick={() => finish(false)}>
            {t("rename.cancel")}
          </button>
        )}
      </div>
    </Dialog>
  );
}
