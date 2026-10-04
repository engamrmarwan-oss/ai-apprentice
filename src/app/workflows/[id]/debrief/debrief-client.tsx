"use client";

import { useState } from "react";
import { AuthenticatedApp } from "@/components/app-shell/authenticated-app";
import { DebriefView } from "@/components/debrief/debrief-view";
import { debriefFixture } from "@/fixtures/debrief";

export function DebriefClient({ workflowId }: { workflowId: string }) {
  return (
    <AuthenticatedApp workflowId={workflowId}>
      {({ workflow }) =>
        workflow?.role === "expert" ? (
          <DebriefScreen />
        ) : (
          <div className="mx-auto grid min-h-[70dvh] max-w-xl place-items-center px-6 text-center">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.035em]">Expert access only</h1>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Only the expert teaching this workflow can review its debrief.
              </p>
            </div>
          </div>
        )
      }
    </AuthenticatedApp>
  );
}

function DebriefScreen() {
  const [selectedQuestionId, setSelectedQuestionId] = useState(
    debriefFixture.questions.find(
      (question) => question.channel === "debrief" && question.status === "asked",
    )?.id ?? null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 md:px-10 md:py-12 lg:px-14">
      <header className="flex flex-col gap-5 border-b border-stone-200 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-800">Expert session</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Debrief</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
            Fill the gaps Tiro could not ask about while you worked, then check the workflow it learned.
          </p>
        </div>
        <div className="text-sm text-stone-500 sm:text-right">
          <p className="font-semibold text-stone-700">{debriefFixture.sessionLabel}</p>
          <p className="mt-1">Preview data</p>
        </div>
      </header>

      <div className="py-8">
        <DebriefView
          notice={notice}
          onConfirm={() => setNotice("Preview only — the live confirmation route is not connected here.")}
          onCorrect={() => setNotice("Tell Tiro what to change in the conversation above.")}
          onSelectQuestion={(questionId) => {
            setNotice(null);
            setSelectedQuestionId(questionId);
          }}
          report={debriefFixture}
          selectedQuestionId={selectedQuestionId}
        />
      </div>
    </div>
  );
}
