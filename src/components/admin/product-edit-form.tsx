"use client";

import { useActionState, useState } from "react";
import {
  AdminCard,
  CheckboxField,
  FormResult,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/admin/admin-form";
import { IgdbArtworkPicker } from "@/components/admin/igdb-artwork-picker";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages";
import {
  INITIAL_CATALOG_STATE,
  type CatalogActionState,
} from "@/app/[locale]/dashboard/catalog/action-state";
import {
  deleteProductAction,
  updateProductAction,
} from "@/app/[locale]/dashboard/catalog/actions";
import type { AdminCategory, AdminProduct } from "@/lib/services/admin-catalog.service";
import { PRODUCT_KINDS } from "@/lib/services/admin-catalog.service";

/**
 * Game editor.
 *
 * Two sibling forms rather than one: saving and deleting are different
 * intentions, and a destructive submit must never be the button an admin hits by
 * reflex on the way out of a text field. Deletion asks for a native confirmation
 * first, so cancelling never reaches the server at all.
 *
 * Latin-only values — the slug, URLs, numbers — are forced to `dir="ltr"` so
 * they stay readable on the Arabic (RTL) dashboard.
 */
export type ProductEditFormProps = {
  locale: Locale;
  messages: AdminMessages["catalog"]["game"];
  errors: AdminMessages["catalog"]["errors"];
  categories: AdminCategory[];
  game: AdminProduct;
};

function resolveError(
  errors: AdminMessages["catalog"]["errors"],
  key: string | null,
): string | null {
  if (!key) {
    return null;
  }

  return errors[key as keyof AdminMessages["catalog"]["errors"]] ?? errors.unknown;
}

export function ProductEditForm({ locale, messages, errors, categories, game }: ProductEditFormProps) {
  const [saveState, saveAction, saving] = useActionState<CatalogActionState, FormData>(
    updateProductAction,
    INITIAL_CATALOG_STATE,
  );
  const [deleteState, deleteAction, deleting] = useActionState<CatalogActionState, FormData>(
    deleteProductAction,
    INITIAL_CATALOG_STATE,
  );

  /*
   * The two artwork URLs are controlled so the IGDB picker can fill them: a
   * picker that could only suggest would still leave the admin copying a URL
   * by hand, which is the step this exists to remove. Everything else stays
   * uncontrolled — the picker has no opinion about a slug.
   */
  const [imageUrl, setImageUrl] = useState(game.imageUrl ?? "");
  const [logoUrl, setLogoUrl] = useState(game.logoUrl ?? "");

  const error = resolveError(errors, saveState.error ?? deleteState.error);

  return (
    <AdminCard title={messages.title} description={messages.description}>
      <form action={saveAction} className="grid gap-5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="gameId" value={game.id} />

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={messages.categoryLabel}
            hint={messages.categoryHint}
            name="categoryId"
            defaultValue={game.categoryId ?? ""}
            options={[
              { value: "", label: messages.categoryNone },
              ...categories.map((category) => ({
                value: category.id,
                label: `${category.nameAr} / ${category.nameEn}`,
              })),
            ]}
          />
          <SelectField
            label={messages.productKindLabel}
            hint={messages.productKindHint}
            name="productKind"
            defaultValue={game.productKind}
            options={PRODUCT_KINDS.map((kind) => ({
              value: kind,
              label: messages.productKinds[kind],
            }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={messages.nameAr}
            name="nameAr"
            defaultValue={game.nameAr}
            required
            maxLength={160}
          />
          <TextField
            label={messages.nameEn}
            name="nameEn"
            defaultValue={game.nameEn}
            required
            maxLength={160}
            dir="ltr"
          />
          <TextField
            label={messages.slug}
            hint={messages.slugHint}
            name="slug"
            defaultValue={game.slug}
            required
            maxLength={80}
            dir="ltr"
            spellCheck={false}
            className="font-mono"
          />
          <TextField
            label={messages.sortOrder}
            name="sortOrder"
            type="number"
            min={0}
            step={1}
            defaultValue={game.sortOrder}
            required
            dir="ltr"
            className="tabular-nums"
          />
          <TextField
            label={messages.pointsNameAr}
            hint={messages.pointsHint}
            name="pointsNameAr"
            defaultValue={game.pointsNameAr ?? ""}
            maxLength={80}
          />
          <TextField
            label={messages.pointsNameEn}
            name="pointsNameEn"
            defaultValue={game.pointsNameEn ?? ""}
            maxLength={80}
            dir="ltr"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextAreaField
            label={messages.descriptionAr}
            hint={messages.descriptionHint}
            name="descriptionAr"
            defaultValue={game.descriptionAr ?? ""}
            maxLength={4000}
            rows={4}
          />
          <TextAreaField
            label={messages.descriptionEn}
            hint={messages.descriptionHint}
            name="descriptionEn"
            defaultValue={game.descriptionEn ?? ""}
            maxLength={4000}
            rows={4}
            dir="ltr"
          />
        </div>

        <IgdbArtworkPicker
          locale={locale}
          messages={messages.igdb}
          onPickCover={setImageUrl}
          onPickArtwork={setLogoUrl}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={messages.imageUrl}
            name="imageUrl"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            maxLength={600}
            dir="ltr"
            inputMode="url"
            spellCheck={false}
          />
          <TextField
            label={messages.logoUrl}
            name="logoUrl"
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
            maxLength={600}
            dir="ltr"
            inputMode="url"
            spellCheck={false}
          />
          <TextField
            label={messages.carouselBadgeAr}
            name="carouselBadgeAr"
            defaultValue={game.carouselBadgeAr ?? ""}
            maxLength={80}
          />
          <TextField
            label={messages.carouselBadgeEn}
            name="carouselBadgeEn"
            defaultValue={game.carouselBadgeEn ?? ""}
            maxLength={80}
            dir="ltr"
          />
          <TextField
            label={messages.carouselOrder}
            name="carouselOrder"
            type="number"
            min={0}
            step={1}
            defaultValue={game.carouselOrder ?? ""}
            dir="ltr"
            className="tabular-nums"
          />
          <SelectField
            label={messages.carouselLogoTone}
            hint={messages.carouselLogoToneHint}
            name="carouselLogoTone"
            defaultValue={game.carouselLogoTone ?? ""}
            options={[
              { value: "", label: messages.carouselLogoToneNone },
              { value: "light", label: messages.carouselLogoToneLight },
              { value: "dark", label: messages.carouselLogoToneDark },
            ]}
          />
          <TextField
            label={messages.carouselColor}
            hint={messages.carouselColorHint}
            name="carouselColor"
            defaultValue={game.carouselColor ?? ""}
            maxLength={9}
            dir="ltr"
            spellCheck={false}
            type="text"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <CheckboxField
            label={messages.isActive}
            hint={messages.isActiveHint}
            name="isActive"
            defaultChecked={game.isActive}
          />
          <CheckboxField
            label={messages.isFeatured}
            name="isFeatured"
            defaultChecked={game.isFeatured}
          />
          <CheckboxField
            label={messages.showInCarousel}
            name="showInCarousel"
            defaultChecked={game.showInCarousel}
          />
        </div>

        <FormResult error={error} notice={saveState.notice === "saved" ? messages.saved : null} />

        <div>
          <Button type="submit" disabled={saving}>
            {messages.saveAction}
          </Button>
        </div>
      </form>

      <div className="mt-6 border-t border-[var(--line)] pt-6">
        <div className="flex flex-wrap items-center gap-4">
          <form action={deleteAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="gameId" value={game.id} />
            <Button
              type="submit"
              variant="secondary"
              disabled={deleting}
              // Confirmation lives on the button so a cancelled delete never
              // reaches the server, and the destructive path needs no extra state.
              onClick={(event) => {
                if (!window.confirm(messages.deleteConfirm)) {
                  event.preventDefault();
                }
              }}
              className="border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--danger)] hover:border-[var(--danger)] hover:bg-[var(--danger-surface)]"
            >
              {messages.deleteAction}
            </Button>
          </form>

          <p className="max-w-md text-xs leading-5 text-[var(--ink-muted)]">
            {messages.deleteConfirm}
          </p>
        </div>
      </div>
    </AdminCard>
  );
}
