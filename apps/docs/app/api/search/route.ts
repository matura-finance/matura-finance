import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

// Server (Orama) search: the index is built at request time from the compiled page content. Fully
// local — no external service, no API key. Under `output: standalone` the content is traced into
// the image, so this works in Docker (verified in Phase 4). A static-index variant (staticGET +
// client `type: "static"`) is a possible later optimization if the server index proves heavy.
export const { GET } = createFromSource(source);
