import en from "./en.json";
import es from "./es.json";
import fr from "./fr.json";
import de from "./de.json";
import it from "./it.json";
import pt from "./pt.json";
import ja from "./ja.json";
import ko from "./ko.json";
import zh from "./zh.json";
import ru from "./ru.json";
import ar from "./ar.json";
import hi from "./hi.json";
import tr from "./tr.json";
import nl from "./nl.json";
import pl from "./pl.json";
import sv from "./sv.json";

export const LOCALES: Record<string, any> = {
  en,
  es,
  fr,
  de,
  it,
  pt,
  ja,
  ko,
  zh,
  ru,
  ar,
  hi,
  tr,
  nl,
  pl,
  sv,
};

export const LOCALE_META: { code: string; name: string }[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "zh", name: "中文" },
  { code: "ru", name: "Русский" },
  { code: "ar", name: "العربية" },
  { code: "hi", name: "हिन्दी" },
  { code: "tr", name: "Türkçe" },
  { code: "nl", name: "Nederlands" },
  { code: "pl", name: "Polski" },
  { code: "sv", name: "Svenska" },
];
