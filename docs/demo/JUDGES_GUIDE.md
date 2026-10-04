# Tiro: guide for judges

Tiro watches an expert work in a web tool, asks why at the right moments, builds a Work Map, and teaches it to a new hire. This page gets you through both roles in about ten minutes.

## Before you start

- Use Chrome or Edge on a computer, and allow the microphone when asked.
- Tiro: https://tiro-ai.vercel.app
- The tool being watched is Crystal: `<Crystal address>`. Open it in its own tab and sign in with the Crystal demo login you were given.
- You were given two Tiro sign-ins: the demo expert and the demo new hire.

## See what Tiro learned (1 minute)

1. Sign in to Tiro as the demo expert.
2. Open the workflow on the home page, then **Work Map**.
3. Each step shows the expert's screen at that moment, the decision, and the reason in the expert's own words. Select a rule to see its kind, the quote behind it and how it is checked.

This map came from one recorded session of an expert reviewing requirements in Crystal, followed by a spoken debrief.

## Be the new hire (4 minutes)

This is the required test: a case the expert never showed, and a wrong decision caught before it is saved.

1. Sign out, and sign in as the demo new hire.
2. Open the workflow, then **Tutor**, then **Start a tutor session**.
3. Select **Connect voice**. A small companion window opens; keep it.
4. Select **Share the tool's tab** and choose the Crystal tab. Chrome moves you to Crystal.
5. In Crystal, open a requirement in the second project. Tiro says what the expert does here and asks what you would decide.
6. Answer aloud with something the expert would not do, for example: "I would approve it right away, the tests can wait."
7. Tiro stops you before you act, says the rule, gives the expert's reason in the expert's words, and shows the expert's screen in the companion window. It then asks what you would do instead.
8. Give the right answer, then select **End session** in the companion window.
9. Back in Tiro, the mastery report shows each rule's outcome and what to practise next.

To talk to Tiro at any other moment, say its name or select **Call Tiro**.

## Be the expert (5 minutes)

1. Sign in as the demo expert. Open the workflow, then **Capture**, then **Start a session**.
2. **Connect voice**, then **Share the tool's tab** and choose the Crystal tab.
3. Tiro asks what you are about to do. Tell it, then review two or three requirements in the first project, saying aloud what you would normally only think.
4. Tiro stays quiet while you work. When you pause after a decision, it says what it understood and asks one question. At least one is about a limit, an exception or when you would stop and ask.
5. Select **End task** in the companion window, then **Open debrief** and **Start debrief**.
6. Tiro asks what is still open, then explains the process back. Correct it by voice if it is wrong. When it is right, say so: the Work Map is confirmed.

## A lesson in another language

Open `https://tiro-ai.vercel.app/spikes/tutor?language=de` as the demo new hire. The lesson is held in German on the same English Work Map: Tiro speaks German, understands German answers, and gives the expert's words translated, saying that they are.

## If something does not work

- **No companion window:** the browser is not Chrome or Edge.
- **Tiro does not hear you:** the microphone was not allowed for the site. Allow it in the address bar and reload.
- **Tiro says nothing after you share:** wait for the first screen to be read; it takes a few seconds.
