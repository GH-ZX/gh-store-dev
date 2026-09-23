import { useState, type InputHTMLAttributes } from "react";
export function PasswordInput({ locale, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>,"type"> & { locale: "ar" | "en" }) {
  const [visible,setVisible]=useState(false);
  return <span className="sf-password-input"><input {...props} className={className} type={visible ? "text" : "password"} /><button type="button" aria-pressed={visible} aria-label={locale === "ar" ? "إظهار كلمة المرور" : "Show password"} onClick={()=>setVisible(v=>!v)}>{visible ? locale === "ar" ? "إخفاء" : "Hide" : locale === "ar" ? "إظهار" : "Show"}</button></span>;
}
