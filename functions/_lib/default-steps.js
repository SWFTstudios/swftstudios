/**
 * Default project steps: every new client project starts with these, so the
 * client dashboard is never empty. Project-specific steps (a CMS connection,
 * a content shoot, a booking integration) are added afterwards in the admin
 * Projects tab, usually right after the initial call.
 *
 * Edit this list to change what every NEW project gets. Existing projects are
 * never touched. `status` is the starting status: "Deposit paid" starts done
 * because a project is only created once a payment lands.
 */
export const DEFAULT_STEPS = [
  { title: "Initial call", detail: "We talk through your goals, your audience and what the site needs to do.", status: "upcoming" },
  { title: "Deposit paid", detail: "Your deposit is received and your project is booked.", status: "done" },
  { title: "Design review", detail: "Pages are designed and reviewed together before the build starts.", status: "upcoming" },
  { title: "Build", detail: "Pages are built, connected and tested on phone and desktop.", status: "upcoming" },
  { title: "Review & revisions", detail: "You review the build and we make agreed changes.", status: "upcoming" },
  { title: "Launch", detail: "Domain connected, final checks done, site live.", status: "upcoming" },
  { title: "30-day support check-in", detail: "We check in after launch and fix anything that comes up.", status: "upcoming" },
];
