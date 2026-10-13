# Physical device checklist

Fill date, exact OS version, result and notes. On 2026-10-13 the user confirmed Windows and iPhone are available; iPad/Pencil are unavailable. Automated browser emulation does not fill these physical acceptance rows.

Windows evidence on 2026-10-13: the owner installed the account-configured
0.0.1 candidate, completed Google sign-in with automatic browser-to-app return,
then closed/reopened the app with the session retained. Windows 11 Pro
10.0.26300/build 26300 was read from the OS. Computer Use verified the original
account, existing notes, Ctrl+K palette and Escape dismissal; the installed
binary matches the candidate after the standard NSIS bundle-marker patch.
This subset does not verify screen readers, native IME, offline editing,
scaling, notifications, uninstall on this device or the signed updater.

iPhone evidence on 2026-10-13, reported by the owner: iOS 27.0.1; Safari
Google and email-code sign-in, Home Screen installation, the original workspace
and session retained on reopening, Khmer and Chinese typing, and VoiceOver
checks work. The owner explicitly confirmed both languages and VoiceOver.
The model was not supplied. No agent-observed physical iPhone result or full
offline/gesture/rotation/notification/stress checklist is inferred.

Start with the published account screen in Windows Chrome and iPhone Safari:
sign in to the original account, confirm the existing notes appear, and reload
to check the session persists. Keep codes in the app. Then create one clearly
named disposable verification note to check native English/Khmer/Chinese input,
keyboard geometry, reload persistence and cross-device sync. Use VoiceOver and
Narrator to check labelled controls, focus order, overlay dismissal and returning
to the editor. Record actual OS/browser versions and failures in the ledger.
Use the account-configured candidate for real sign-in checks. CI's development
fixture passes the approved 450 MiB aggregate memory gate; it does not prove
account sign-in or a signed native release. Signed updater acceptance remains open.

**A. iPhone 15, in a Safari tab and then as a Home Screen web app**

- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — First paint has no flash of the wrong theme in light and dark.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Add to Home Screen with "Open as Web App" on. It launches with no Safari chrome, the right icon and name, and a clean launch screen.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Nothing sits under the Dynamic Island or home indicator in portrait and landscape, and the status bar reads correctly.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Sign in with Google and with an email code, both inside the installed app.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Type English, Khmer and Chinese on the system keyboard. The slash menu and shortcuts never fire mid-composition, nothing jumps when the keyboard opens, and the toolbar sits above it.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Slash menu, mentions, checklists, long-press drag reorder, undo and redo all work.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Airplane mode: edit a page, add an event and a journal entry, reconnect, and see all three on another device within a minute.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Calendar: month to day, long-press then drag to create, resize, the Undo toast, and a time-zone sanity check.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Switch dark mode from Control Center while the app is open: the app follows. A manual override survives a relaunch.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Every tap shows feedback at once. With Reduce Motion on there are no springs.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Rotate. Background the app for 10 minutes, return, then kill and reopen it. State is intact and sync resumes with nothing lost.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Web Push (P2): the permission prompt follows a tap, and a notification arrives with the app closed.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Haptics, if enabled: a checkbox gives a light tap.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Scrolling a 1,000-block page and a 200-event month stays smooth.

**B. iPad (A16)**

- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Portrait and landscape layouts, the sidebar and the three-pane view.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Split View at two widths: layout adapts, nothing overflows.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Hardware keyboard: Cmd+K, the shortcut list, Tab order, Esc closes overlays.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Trackpad or mouse: hover states appear only with a pointer, and disappear when it is detached.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Apple Pencil (P3): sketch and Scribble work, with the pressure fallback if the Pencil reports none.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Drag and drop of images and files from Files and Photos. Resize the window, if iPadOS allows it.

**C. Windows**

- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Download the installer, see the SmartScreen steps from the README, install, and find the Start menu entry.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Sign in through the system browser and land back in the running app through the deep link.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Minimize, maximize and Snap Layouts work, and the window remembers its size and position.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Display scaling at 100, 125 and 150 percent: nothing blurry, nothing clipped.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Light and dark follow the system and the manual override, including the title bar.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Offline editing, then reconnect and sync.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Update flow: install version N, publish N+1, and accept the update.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Uninstall leaves no leftovers. Tray, hotkey and notifications (P3) work after install.

**D. Across devices**

- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — An edit on one device appears on another in under 5 seconds when both are online.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Two devices edit the same paragraph offline and both edits survive the merge. Two devices change the same event title offline and the later one wins.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Theme and accent settings sync.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Delete on one device and find the item in Trash on the others, and restore it.
- [ ] Date: ____ · OS: ____ · Result (Pass/Fail/Notes): ____ — Connect a second Google account, disconnect it, and check its events are gone and its tokens are revoked (P2).

