import { config } from "../../infrastructure/config";
import type { CreateLinkResponse, CreatedLinkRecord } from "./types";

export function toCreateLinkResponse(link: CreatedLinkRecord): CreateLinkResponse {
    return {
        shortUrl: `${config.BASE_URL}/${link.shortCode}`,
    };
}
