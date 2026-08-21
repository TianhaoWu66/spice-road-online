declare module "jsqr" {
  interface QRCodeResult {
    data: string;
    binaryData: number[];
    chunks: unknown[];
    version: number;
    location: unknown;
  }
  interface QRCodeOptions {
    inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst";
  }
  function jsQR(data: Uint8ClampedArray, width: number, height: number, providedOptions?: QRCodeOptions): QRCodeResult | null;
  export default jsQR;
}
