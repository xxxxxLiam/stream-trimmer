/**
 * File: stopwords.ts
 * Path: src/main/features/engine/services/clipNames/stopwords.ts
 * Description: English filler and function words that never make a clip name. English only; other
 *   languages fall back to plain frequency until someone asks.
 */
export const STOPWORDS = new Set(
  (
    (
    "a about above after again all also am an and any are as at be because been before being below " +
    "between both but by can could did do does doing done down during each even ever every few for " +
    "from further get gets getting go goes going gonna gotta got had has have having he her here " +
    "hers him his how i if in into is it its just kind know let like literally lot man me mean " +
    "might more most much must my myself no nor not now of off oh ok okay on once one only or other " +
    "ought our out over own really right same say says she should so some something such sure " +
    "than that the their them then there these they thing things think this those through to too " +
    "um uh under until up us very want was way we well were what when where which while who whom " +
    "why will with would yeah yes you your yourself actually basically honestly maam sir yep yup " +
    "mm hmm huh whatever anyway anything everything anybody somebody nobody everybody back still " +
    "than also may maybe much many"
    ).split(/\s+/)
  ),
);
