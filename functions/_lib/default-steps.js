/**
 * Default project steps: every new client project starts with these, so the
 * client dashboard is never empty. Project-specific steps (a CMS connection,
 * a content shoot, a booking integration) are added afterwards in the admin
 * Projects tab, usually right after the initial call.
 *
 * Edit this list to change what every NEW project gets. Existing projects are
 * never touched. `status` is the starting status: "Deposit paid" starts done
 * because a project is only created once a payment lands. "Final payment" sits
 * after "Final approval" and before "Launch" so clients know the balance is due
 * before the site goes live.
 *
 * `days` is the default length of each step in working days (Mon-Fri). The
 * admin "Set target dates" control and new projects use these to plan dates,
 * so a three-week window gives Build more room than Final approval. `afterLaunch`
 * steps are not part of the build window: they land that many calendar days
 * after the launch date.
 */
export const DEFAULT_STEPS = [
  { title: "Initial call", detail: "We talk through your goals, your audience and what the site needs to do.", status: "upcoming", days: 1 },
  { title: "Deposit paid", detail: "Your deposit is received and your project is booked.", status: "done", days: 0 },
  { title: "Design review", detail: "Pages are designed and reviewed together before the build starts.", status: "upcoming", days: 4 },
  { title: "Build", detail: "Pages are built, connected and tested on phone and desktop.", status: "upcoming", days: 5 },
  { title: "Review & revisions", detail: "You review the build and we make agreed changes.", status: "upcoming", days: 3 },
  { title: "Final approval", detail: "You sign off that everything is ready to go live.", status: "upcoming", days: 1 },
  { title: "Final payment", detail: "The remaining balance is due before launch. We send your invoice once final approval is in, and the site goes live after it is paid.", status: "upcoming", days: 1 },
  { title: "Launch", detail: "Domain connected, final checks done, site live.", status: "upcoming", days: 1 },
  { title: "30-day support check-in", detail: "We check in after launch and fix anything that comes up.", status: "upcoming", afterLaunch: 30 },
];

/**
 * Default length for a step that isn't in the list above (steps added per
 * project, renamed steps): matched by keywords in the title, else 2 working days.
 */
const DURATION_RULES = [
  [/deposit/i, { days: 0 }],
  [/support|check[- ]?in|follow[- ]?up/i, { afterLaunch: 30 }],
  [/launch|go[- ]?live/i, { days: 1 }],
  [/payment|invoice/i, { days: 1 }],
  [/approv|sign[- ]?off/i, { days: 1 }],
  [/review|revision|feedback/i, { days: 3 }],
  [/build|develop/i, { days: 5 }],
  [/design|layout|wireframe|mock/i, { days: 4 }],
  [/cms|integrat|connect|setup|set up/i, { days: 3 }],
  [/content|copy|photo|shoot|video/i, { days: 3 }],
  [/call|kick[- ]?off|meeting/i, { days: 1 }],
];

/** { days } or { afterLaunch } for a step title. */
export function stepDuration(title) {
  const t = String(title || "").trim().toLowerCase();
  const exact = DEFAULT_STEPS.find((s) => s.title.toLowerCase() === t);
  if (exact) return exact.afterLaunch ? { afterLaunch: exact.afterLaunch } : { days: exact.days ?? 2 };
  for (const [re, d] of DURATION_RULES) if (re.test(t)) return d;
  return { days: 2 };
}
