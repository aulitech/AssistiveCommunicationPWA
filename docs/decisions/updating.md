# Updating

> One of the decisions behind Peri, moved out of [AGENTS.md](../../AGENTS.md), which keeps the map of
> the source and the rules that hold everywhere. What is written here is why the code is the shape it is.

**Peri updates itself whenever it is opened with a connection**, installed or not. The service worker (`public/sw.js`) asks for the page fresh every time and answers from its cache only with no network; only what is under `/assets/` is served from the cache first, and every file there carries a hash of its contents in its name, so a new release is a new name and nothing stored can hold it back. A new worker takes over at once (`skipWaiting`, `clients.claim`) rather than waiting for every copy to close.

- **What did not update was a copy already open.** An iPad left on the board for days ran the release it was opened on, with nothing to say a newer one was out. So the open copy asks (`talk/use-new-version.ts`): when it is looked at again, when the connection comes back, a minute after opening and every fifteen minutes. It asks for the page fresh, past every cache, and compares the script the page names with the one it is running — the script's name changes with every release and with nothing else, so no version file has to be written at build.
- **Offered, never forced.** A strip at the top says a new version is ready, with **Update now**, which reloads, and **Later**, which hides it until a release newer than the one declined. A reload loses whatever is in the message box, and one in the middle of a sentence would lose the sentence, so the person chooses the moment. It was the choice between this and reloading by itself at an idle moment, and this was chosen.
- **The same strip as a failed save, in the same place** — in the flow at the top rather than over the board, and its arrival holding the dwells, since it moves the screen down under a pointer that may be resting. In the accent rather than amber: nothing is wrong, and nothing is lost by waiting.
- **No answer is no news.** Offline, or a server that fails, offers nothing and asks again later. The built app alone: the development server's page names no built script.
