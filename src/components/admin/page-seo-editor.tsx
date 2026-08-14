"use client";

import { useActionState } from "react";
import {
  INITIAL_WEBSITE_STATE,
  resolveWebsiteError,
  type WebsiteActionState,
} from "@/app/[locale]/dashboard/website/action-state";
import { savePageSeoAction } from "@/app/[locale]/dashboard/website/actions";
import { FormResult, TextAreaField, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import { ChevronIcon } from "@/components/ui/icons";
import type { AdminMessages } from "@/i18n/messages";
import {
  EMPTY_PAGE_SEO,
  SEO_PAGE_PATHS,
  type PageSeoMap,
  type SeoPagePath,
} from "@/lib/settings/page-seo";

/**
 * Titles and descriptions for the pages beyond the homepage.
 *
 * Ten pages, four fields each. Rendered as collapsed disclosures with one form
 * inside each, so the page stays readable and — more importantly — a save only
 * carries the page being edited. One form over all forty fields would make every
 * save a chance to overwrite the nine pages the owner was not looking at.
 *
 * A page that has never been set shows empty fields, and empty is a real answer:
 * it means the page keeps its own wording, which is what an unset page has
 * always done.
 */
export type PageSeoEditorProps = {
  pages: PageSeoMap;
  messages: AdminMessages["website"]["pageSeo"];
  seoMessages: AdminMessages["website"]["seo"];
  errors: AdminMessages["website"]["errors"];
};

function PageRow({
  path,
  seo,
  messages,
  seoMessages,
  errors,
}: {
  path: SeoPagePath;
  seo: PageSeoMap[SeoPagePath];
  messages: PageSeoEditorProps["messages"];
  seoMessages: PageSeoEditorProps["seoMessages"];
  errors: PageSeoEditorProps["errors"];
}) {
  const [state, formAction, pending] = useActionState<WebsiteActionState, FormData>(
    savePageSeoAction,
    INITIAL_WEBSITE_STATE,
  );
  const values = seo ?? EMPTY_PAGE_SEO;
  const isSet = Boolean(seo);

  return (
    <details className="group rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-[var(--ink-soft)]" dir="ltr">
            {path}
          </span>
          <span className="text-sm text-[var(--ink)]">{messages.pages[path]}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-[var(--ink-faint)]">
            {isSet ? messages.stateSet : messages.stateDefault}
          </span>
          <ChevronIcon
            direction="down"
            className="size-4 text-[var(--ink-faint)] transition-transform duration-[var(--duration)] group-open:rotate-180"
          />
        </span>
      </summary>

      <form action={formAction} className="grid gap-4 border-t border-[var(--line)] p-4">
        <input type="hidden" name="path" value={path} />

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={seoMessages.titleAr}
            name="title_ar"
            defaultValue={values.titleAr}
            maxLength={160}
          />
          <TextField
            label={seoMessages.titleEn}
            name="title_en"
            defaultValue={values.titleEn}
            maxLength={160}
            dir="ltr"
          />
          <TextAreaField
            label={seoMessages.descriptionAr}
            name="description_ar"
            defaultValue={values.descriptionAr}
            maxLength={320}
          />
          <TextAreaField
            label={seoMessages.descriptionEn}
            name="description_en"
            defaultValue={values.descriptionEn}
            maxLength={320}
            dir="ltr"
          />
        </div>

        <FormResult
          error={resolveWebsiteError(errors, state.error)}
          notice={state.notice ? seoMessages.saved : null}
        />

        <div>
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {seoMessages.saveAction}
          </Button>
        </div>
      </form>
    </details>
  );
}

export function PageSeoEditor({ pages, messages, seoMessages, errors }: PageSeoEditorProps) {
  return (
    <div className="grid gap-2">
      <p className="text-xs leading-5 text-[var(--ink-faint)]">{messages.emptyHint}</p>

      {SEO_PAGE_PATHS.map((path) => (
        <PageRow
          key={path}
          path={path}
          seo={pages[path]}
          messages={messages}
          seoMessages={seoMessages}
          errors={errors}
        />
      ))}
    </div>
  );
}
