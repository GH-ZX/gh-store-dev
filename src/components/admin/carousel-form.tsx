"use client";

import { useActionState } from "react";
import {
  INITIAL_WEBSITE_STATE,
  resolveWebsiteError,
  type WebsiteActionState,
} from "@/app/[locale]/dashboard/website/action-state";
import { saveCarouselAction } from "@/app/[locale]/dashboard/website/actions";
import { CheckboxField, FormResult, SelectField, TextField } from "@/components/admin/admin-form";
import { Button } from "@/components/ui/button";
import type { AdminMessages } from "@/i18n/messages";
import {
  HOME_CAROUSEL_INTERVAL_MAX_SECONDS,
  HOME_CAROUSEL_INTERVAL_MIN_SECONDS,
  type HomeSection,
} from "@/lib/home/layout";

/**
 * How the homepage carousel behaves.
 *
 * Four settings and no more. The carousel library exposes a few dozen options
 * and almost all of them are decisions about a component rather than about a
 * store — an owner has an opinion on whether it moves by itself and how fast,
 * not on drag thresholds or scroll containment.
 *
 * The rotation note is not decoration: a visitor who has asked their system for
 * reduced motion gets a still carousel whatever this says, and an owner who
 * turned rotation on and sees none on their own machine deserves to know why
 * before they go looking for a bug.
 */
export type CarouselFormProps = {
  section: HomeSection | null;
  messages: AdminMessages["website"]["carousel"];
  errors: AdminMessages["website"]["errors"];
};

export function CarouselForm({ section, messages, errors }: CarouselFormProps) {
  const [state, formAction, pending] = useActionState<WebsiteActionState, FormData>(
    saveCarouselAction,
    INITIAL_WEBSITE_STATE,
  );

  // A layout with no carousel section has nothing to configure; the layout
  // editor above is where one is added back.
  if (!section) {
    return <p className="text-sm leading-6 text-[var(--ink-muted)]">{messages.missing}</p>;
  }

  return (
    <form action={formAction} className="grid gap-4">
      <CheckboxField
        name="autoplay"
        label={messages.autoplayLabel}
        hint={messages.autoplayHint}
        defaultChecked={section.autoplay}
      />

      <TextField
        label={messages.intervalLabel}
        hint={messages.intervalHint}
        name="interval_seconds"
        type="number"
        min={HOME_CAROUSEL_INTERVAL_MIN_SECONDS}
        max={HOME_CAROUSEL_INTERVAL_MAX_SECONDS}
        step={1}
        defaultValue={section.intervalSeconds}
        dir="ltr"
        fieldClassName="max-w-xs"
      />

      <CheckboxField
        name="loop"
        label={messages.loopLabel}
        hint={messages.loopHint}
        defaultChecked={section.loop}
      />

      <SelectField
        label={messages.alignLabel}
        hint={messages.alignHint}
        name="align"
        defaultValue={section.align}
        fieldClassName="max-w-xs"
        options={[
          { value: "center", label: messages.alignCenter },
          { value: "start", label: messages.alignStart },
        ]}
      />

      <p className="text-xs leading-5 text-[var(--ink-faint)]">{messages.reducedMotionNote}</p>

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
