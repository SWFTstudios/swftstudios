// Fixed-scope paid extras; mirror of data/addons.json. Purchase requires eligible base package.
export const ADDONS = Object.freeze({
  "extra-pages": {
    "id": "extra-pages",
    "name": "Extra unique pages",
    "description": "Unique pages beyond your standard 5, like a service, location or event page. One flat price for the set.",
    "priceCents": 17500,
    "category": "Website extras",
    "requires": [
      "website-only",
      "website-content-half",
      "website-content-full"
    ]
  },
  "extra-photos": {
    "id": "extra-photos",
    "name": "10 more edited photos",
    "description": "Ten additional finished photos from your existing shoot.",
    "priceCents": 10000,
    "category": "Photo extras",
    "requires": [
      "website-content-half",
      "website-content-full",
      "photo-session",
      "product-photos"
    ]
  },
  "extra-reels": {
    "id": "extra-reels",
    "name": "Additional edited short video",
    "description": "One extra short-form video from the planned shoot.",
    "priceCents": 12500,
    "category": "Video extras",
    "requires": [
      "website-content-half",
      "website-content-full",
      "short-form-pack",
      "brand-film"
    ]
  },
  "extra-shoot": {
    "id": "extra-shoot",
    "name": "Extra filming hour",
    "description": "One additional filming hour at the same approved location.",
    "priceCents": 15000,
    "category": "Video extras",
    "requires": [
      "website-content-half",
      "website-content-full",
      "short-form-pack",
      "brand-film"
    ]
  },
  "raw-assets": {
    "id": "raw-assets",
    "name": "Raw footage delivery",
    "description": "Unedited footage from your video shoot, delivered as available.",
    "priceCents": 10000,
    "category": "Video extras",
    "requires": [
      "website-content-half",
      "website-content-full",
      "short-form-pack",
      "brand-film"
    ]
  },
  "testimonials": {
    "id": "testimonials",
    "name": "Filmed testimonial",
    "description": "One filmed testimonial during your scheduled shoot.",
    "priceCents": 17500,
    "category": "Video extras",
    "requires": [
      "website-content-half",
      "website-content-full",
      "short-form-pack",
      "brand-film"
    ]
  },
  "location-profiles": {
    "id": "location-profiles",
    "name": "Additional Google Business Profile",
    "description": "One additional profile in the GBP refresh scope.",
    "priceCents": 17500,
    "category": "Local SEO extras",
    "requires": [
      "gbp-refresh"
    ]
  },
  "local-page": {
    "id": "local-page",
    "name": "Local landing page",
    "description": "One additional location page for a GBP refresh.",
    "priceCents": 25000,
    "category": "Local SEO extras",
    "requires": [
      "gbp-refresh"
    ]
  }
});
