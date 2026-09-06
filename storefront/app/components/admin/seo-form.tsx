import { useWebsiteAction } from "@/components/admin/use-website-action";
import {
  resolveWebsiteError,
} from "@/components/admin/website-action-state";
import { FormResult, TextAreaField, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { AdminMessages } from "@/i18n/messages";
import type { PublicStoreSettings } from "@/lib/settings/public-settings";

/**
 * Homepage SEO form.
 *
 * These values become the homepage title, description, and share image, so an
 * empty field is stored as empty rather than as a guess: the page metadata then
 * falls back to the store defaults instead of showing a stale override.
 */
export type SeoFormProps = {
  seo: PublicStoreSettings["seo"];
  messages: AdminMessages["website"]["seo"];
  errors: AdminMessages["website"]["errors"];
};

export function SeoForm({ seo, messages, errors }: SeoFormProps) {
  const [state, formAction, pending] = useWebsiteAction("saveSeoAction");

  return (
    <form method="post" onSubmit={formAction} className="grid gap-4">
        <input type="hidden" name="intent" value="saveSeoAction" />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={messages.titleAr}
          name="title_ar"
          defaultValue={seo.titleAr}
          maxLength={160}
        />
        <TextField
          label={messages.titleEn}
          name="title_en"
          defaultValue={seo.titleEn}
          maxLength={160}
          dir="ltr"
        />
        <TextAreaField
          label={messages.descriptionAr}
          name="description_ar"
          defaultValue={seo.descriptionAr}
          maxLength={320}
        />
        <TextAreaField
          label={messages.descriptionEn}
          name="description_en"
          defaultValue={seo.descriptionEn}
          maxLength={320}
          dir="ltr"
        />
      </div>

      <TextField
        label={messages.ogImageUrl}
        type="url"
        name="og_image_url"
        defaultValue={seo.ogImageUrl ?? ""}
        maxLength={500}
        dir="ltr"
        inputMode="url"
        spellCheck={false}
        fieldClassName="max-w-xl"
      />

      <FormResult
        error={resolveWebsiteError(errors, state.error)}
        notice={state.notice ? messages.saved : null}
      />

      <div>
        <Button type="submit" disabled={pending}>
          {messages.saveAction}
        </Button>
      </div>
    </form>
  );
}
