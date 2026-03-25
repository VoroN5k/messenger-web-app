import { motion } from 'framer-motion';
import { Shackle } from './lock/Shackle';
import { LockBody } from './lock/LockBody';
import { Key } from './lock/Key';

export const VeloraUnlock = () => {
    return (
        <div className="flex flex-col items-center justify-center bg-[#0F0F13] h-screen">

            {/* Контейнер замка (відносний) */}
            <div className="relative w-[100px] h-[130px] mb-8">

                {/* 1. РОЖЕВА ДУЖКА */}
                <motion.div
                    className="absolute top-0 left-[10px]"
                    initial={{ y: 0 }}
                    animate={{ y: -20 }} // Стрибає вгору на 20px
                    transition={{ delay: 0.6, type: "spring", stiffness: 400, damping: 15 }}
                >
                    <Shackle />
                </motion.div>

                {/* 2. КОРПУС ЗАМКА */}
                <div className="absolute top-[45px] left-0 z-10">
                    <LockBody />
                </div>

                {/* 3. КЛЮЧ */}
                <motion.div
                    // origin-[60px_15px] - це точка, навколо якої крутиться ключ (його кінець, що в замку)
                    className="absolute top-[70px] left-[-35px] z-20 origin-[65px_15px]"
                    initial={{ rotate: 0, x: -10, opacity: 0 }}
                    // Спочатку в'їжджає (opacity/x), потім крутиться (rotate)
                    animate={{ rotate: 90, x: 0, opacity: 1 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                >
                    <Key />
                </motion.div>

            </div>

            {/* Текст VELORA */}
            <div className="text-center">
                <h1 className="text-4xl font-bold tracking-[0.2em] text-white drop-shadow-[0_0_15px_rgba(255,157,187,0.4)]">
                    VELORA
                </h1>
                <p className="text-[#FF9DBB] text-xs tracking-widest mt-3 uppercase font-semibold">
                    Unlocking secure channel
                </p>
            </div>

        </div>
    );
};