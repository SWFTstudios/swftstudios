#!/usr/bin/env python3
"""One-off: replace gallery + Relume blog block in case-studies.html with Match-style hub markup."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "case-studies.html"
DATA = ROOT / "data" / "case-studies-index.json"


def tag_pills(it: dict) -> str:
    labels = []
    if it.get("website"):
        labels.append("Website")
    if it.get("branding"):
        labels.append("Branding")
    if it.get("film"):
        labels.append("Film")
    if not labels:
        labels.append("Insight")
    return "".join(f'<div class="case-study_tag-text">{t}</div>' for t in labels)


def card(it: dict) -> str:
    title = it["name"]
    img = it["image"]
    href = it["href"]
    details = it["details"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f"""          <div role="listitem" class="case-study_item">
            <div class="case-study_card">
              <img src="{img}" loading="lazy" alt="" class="case-study_image">
              <div class="case-study_blur"></div>
              <div class="case-study_header">
                <h2 class="case-study_title">{title}</h2>
                <div class="case-study_tag-list">
                  {tag_pills(it)}
                </div>
              </div>
              <div class="case-study_content w-richtext"><p>{details}</p></div>
              <a href="{href}" class="case-study_link w-inline-block" aria-label="Open {title}"></a>
              <div class="skeleton-bar"></div>
            </div>
          </div>"""


def hub_markup(items: list) -> str:
    cards = "\n".join(card(it) for it in items)
    return f"""              <div class="swft-hub-match" data-swft-hub>
                <div class="swft-hub-match__inner wrap">
                  <div class="content">
                    <div class="loader_sticky">
                      <div class="loader_wrap"><img src="images/swft-thumbnail.webp" loading="lazy" sizes="100vw" alt="" class="loader_image"></div>
                    </div>
                    <div class="cms-wrapper">
                      <div role="list" class="list">
{cards}
                      </div>
                    </div>
                    <div class="panel"></div>
                  </div>
                </div>
                <div class="prompt_wrap">
                  <div class="prompt_element">
                    <textarea id="swft-hub-prompt" aria-label="What are you looking for?" placeholder="What are you looking for?" required="" minlength="1" class="prompt_input"></textarea>
                    <button type="button" aria-label="Find match" class="prompt_circle">
                      <span class="prompt_span"><svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 48 56" fill="none" class="prompt_svg">
                          <path d="M23.6738 6.36719V55.3672" stroke="currentColor" stroke-width="9"></path>
                          <path d="M44.1651 26.8585L23.6738 6.36719L3.18252 26.8585" stroke="currentColor" stroke-width="9"></path>
                        </svg></span>
                      <span class="prompt_span"><svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 48 56" fill="none" class="prompt_svg">
                          <path d="M23.6738 6.36719V55.3672" stroke="currentColor" stroke-width="9"></path>
                          <path d="M44.1651 26.8585L23.6738 6.36719L3.18252 26.8585" stroke="currentColor" stroke-width="9"></path>
                        </svg></span>
                    </button>
                  </div>
                </div>
                <p id="swft-hub-live" class="u-display-none" aria-live="polite"></p>
                <div class="modal_wrap">
                  <div class="modal_backdrop"></div>
                  <div class="modal_layout">
                    <div class="modal_left">
                      <div class="modal_project"></div>
                    </div>
                    <div class="modal_content_wrap">
                      <div class="modal_content_top">
                        <button type="button" class="modal_close_wrap" aria-label="Close">
                          <svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 32 32" fill="none" class="modal_close_svg">
                            <path d="M1.41406 1.41406L30.1726 30.1726" stroke="currentColor" stroke-width="4"></path>
                            <path d="M30.4141 1.41406L1.65551 30.1726" stroke="currentColor" stroke-width="4"></path>
                          </svg>
                        </button>
                      </div>
                      <div data-lenis-prevent="" class="prompt_scroll">
                        <div class="prompt_result"></div>
                        <a href="#" class="prompt_link w-button">View article</a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>"""


def main() -> None:
    text = HTML.read_text(encoding="utf-8")
    start = text.find('<div class="gallery_component">')
    end_marker = "              </header>\n            </div>\n          </div>\n        </div>\n      </section>"
    end = text.find(end_marker, start)
    if start == -1 or end == -1:
        raise SystemExit(f"markers not found start={start} end={end}")
    end = end + len("              </header>")
    items = json.loads(DATA.read_text(encoding="utf-8"))
    new = text[:start] + hub_markup(items) + text[end:]
    HTML.write_text(new, encoding="utf-8")
    print("updated", HTML)


if __name__ == "__main__":
    main()
