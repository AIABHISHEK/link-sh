import { customAlphabet } from "nanoid";

const nanoid = customAlphabet(
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    7
);

export function generateShortCode() {
    return nanoid();
}
