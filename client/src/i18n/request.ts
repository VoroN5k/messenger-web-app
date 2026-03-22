import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export type Locale = 'uk' | 'en';
export const locales: Locale[] = ['uk', 'en'];
export const defaultLocale: Locale = 'uk';

export default getRequestConfig(async () => {
    const cookieStore = await cookies();
    const raw = cookieStore.get('locale')?.value;
    const locale: Locale = (raw && locales.includes(raw as Locale))
        ? (raw as Locale)
        : defaultLocale;

    return {
        locale,
        messages: (await import(`../../messages/${locale}.json`)).default,
    };
});