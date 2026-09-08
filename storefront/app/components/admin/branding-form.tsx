import { useLocation } from "react-router";
import { useWebsiteAction } from "@/components/admin/use-website-action";
import { resolveWebsiteError } from "@/components/admin/website-action-state";
import { CheckboxField, FormResult, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { AdminMessages } from "@/i18n/messages";
import type { PublicStoreSettings } from "@/lib/settings/public-settings";

/**
 * Site name editor.
 *
 * The homepage browser tab always uses the configured name; the switch decides
 * whether it also spreads to the header, footer, and invoices. An empty field
 * means "use the built-in store brand".
 */
export type BrandingFormProps = {
  branding: PublicStoreSettings["branding"];
  messages: AdminMessages["website"]["branding"];
  errors: AdminMessages["website"]["errors"];
};

export function BrandingForm({ branding, messages, errors }: BrandingFormProps) {
  const [state, formAction, pending] = useWebsiteAction("saveBrandingAction");
  const { pathname } = useLocation();
  const ar = pathname.startsWith("/ar");
  return (
    <form method="post" onSubmit={formAction} className="grid gap-4">
        <input type="hidden" name="intent" value="saveBrandingAction" />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={messages.nameAr}
          name="name_ar"
          defaultValue={branding.nameAr}
          maxLength={80}
        />
        <TextField
          label={messages.nameEn}
          name="name_en"
          defaultValue={branding.nameEn}
          maxLength={80}
          dir="ltr"
        />
      </div>

      <CheckboxField
        label={messages.useEverywhere}
        hint={messages.useEverywhereHint}
        name="use_everywhere"
        defaultChecked={branding.useEverywhere}
      />

      <CheckboxField
        label={ar ? "إظهار الشعار الصوري بجانب اسم المتجر" : "Show logo image beside store name"}
        hint={
          ar
            ? "عند التعطيل، يظهر فقط اسم المتجر النصي الأنيق بدون صورة الشعار في الترويسة."
            : "When disabled, only the clean textual store name is shown in the header without the logo image."
        }
        name="show_logo"
        defaultChecked={branding.showLogo}
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