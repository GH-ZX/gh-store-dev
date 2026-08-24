/**
 * Per-navigation mount point.
 *
 * Next remounts a `template` on every navigation where it would reuse a
 * layout, which is exactly what the page entrance needs: the animation lives
 * on this wrapper, so it plays on arrival and on every move between pages
 * without any page having to ask for it. The choreography itself — distance,
 * blur, duration — is all tokens, so the owner's motion level retunes it from
 * the theme stylesheet and reduced-motion visitors skip it entirely.
 */
export default function LocaleTemplate({ children }: { children: React.ReactNode }) {
  return <div className="gh-enter">{children}</div>;
}
