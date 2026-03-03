import { LoginForm } from "@/src/components/auth/LoginForm";
import Link from "next/link";

export default function LoginPage() {
    return (
        <main className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50 p-4">

            <div className="w-full max-w-md">
                <LoginForm />


                <p className="text-center mt-6 text-sm text-gray-600">
                    Немає акаунту?{" "}
                    <Link
                        href="/auth/register"
                        className="text-blue-600 font-semibold hover:underline"
                    >
                        Зареєструватися
                    </Link>
                </p>
            </div>

            {/* Футер або декоративний елемент */}
            <div className="mt-8 text-gray-400 text-xs">
                © 2026 My Messenger App. All rights reserved.
            </div>
        </main>
    );
}