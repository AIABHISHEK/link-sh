export interface CreateLinkPayload {
    longUrl: string;
}

export interface CreatedLinkRecord {
    shortCode: string;
    longUrl: string;
}

export interface CreateLinkResponse {
    shortUrl: string;
}
