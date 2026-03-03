import { RegisterForm } from "@/src/components/auth/RegisterForm";
import Link from "next/link";

export default function RegisterPage() {
    return (
        <main className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-md">
                <RegisterForm />

                <p className="text-center mt-6 text-sm text-gray-600">
                    Вже маєте акаунт?{" "}
                    <Link
                        href="/auth/login"
                        className="text-blue-600 font-semibold hover:underline"
                    >
                        Увійти
                    </Link>
                </p>
            </div>

            <div className="mt-8 text-gray-400 text-xs">
                © 2026 Messenger Web App. Powered by NestJS & Next.js
            </div>
        </main>
    );
}