/**
 * فحص صارم وموحّد لسياسة تجاوز المصادقة في وضع التجربة (Demo Bypass).
 * لا يُسمح بالتجاوز إطلاقًا إلا عندما تكون البيئة development حصرًا
 * ومتغير NEXT_PUBLIC_DEMO يساوي "1" تمامًا.
 */
export function isDemoBypassAllowed(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  demoFlag: string | undefined = process.env.NEXT_PUBLIC_DEMO
): boolean {
  return demoFlag === "1" && nodeEnv === "development";
}
