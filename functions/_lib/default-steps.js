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
 */
export const DEFAULT_STEPS = [
  { title: "Initial call", detail: "We talk through your goals, your audience and what the site needs to do.", status: "upcoming" },
  { title: "Deposit paid", detail: "Your deposit is received and your project is booked.", status: "done" },
  { title: "Design review", detail: "Pages are designed and reviewed together before the build starts.", status: "upcoming" },
  { title: "Build", detail: "Pages are built, connected and tested on phone and desktop.", status: "upcoming" },
  { title: "Review & revisions", detail: "You review the build and we make agreed changes.", status: "upcoming" },
  { title: "Final approval", detail: "You sign off that everything is ready to go live.", status: "upcoming" },
  { title: "Final payment", detail: "The remaining balance is due before launch. We send your invoice once final approval is in, and the site goes live after it is paid.", status: "upcoming" },
  { title: "Launch", detail: "Domain connected, final checks done, site live.", status: "upcoming" },
  { title: "30-day support check-in", detail: "We check in after launch and fix anything that comes up.", status: "upcoming" },
];
