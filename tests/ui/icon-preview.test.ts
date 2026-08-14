import { writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";
import * as brand from "@/components/ui/brand-icons";
import * as icons from "@/components/ui/icons";

// Scratch: renders every mark to /tmp/icons.html so it can be looked at.
test("preview", () => {
  const entries: [string, (props: Record<string, unknown>) => unknown][] = [
    ...Object.entries(brand).filter(([name]) => name.endsWith("Icon") && !["SocialIcon", "ContactIcon"].includes(name)),
    ["MailIcon", icons.MailIcon],
    ["PhoneIcon", icons.PhoneIcon],
    ["LinkIcon", icons.LinkIcon],
    ["GlobeIcon", icons.GlobeIcon],
  ] as never;

  const cells = entries
    .map(([name, Glyph]) => {
      const row = [16, 20, 40]
        .map((size) =>
          renderToStaticMarkup(
            createElement(Glyph as never, { style: { width: size, height: size } }),
          ),
        )
        .join("");

      return `<figure><div class="row">${row}</div><figcaption>${name}</figcaption></figure>`;
    })
    .join("");

  writeFileSync(
    "/tmp/icons.html",
    `<!doctype html><meta charset="utf-8"><style>
      body { background:#0b0d12; color:#e7e9ee; font:14px system-ui; margin:0; padding:24px; }
      .grid { display:grid; grid-template-columns:repeat(4,1fr); gap:20px; }
      figure { margin:0; padding:14px; border:1px solid #262b36; border-radius:12px; }
      .row { display:flex; align-items:center; gap:14px; min-height:44px; }
      figcaption { margin-top:10px; color:#8b93a4; font-size:12px; }
    </style><div class="grid">${cells}</div>`,
  );
});
