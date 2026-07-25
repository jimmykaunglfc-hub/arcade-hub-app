import Image from "next/image";

interface JoeYokeLogoProps {
  className?: string; 
}

export default function JoeYokeLogo({ className = "w-[42px] h-[42px]" }: JoeYokeLogoProps) {
  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      {/* Light Mode Logo */}
      <Image
        src="/assets/logo-light.jpeg" 
        alt="Joe Yoke Logo"
        fill
        sizes="42px"
        priority
        className="block dark:hidden object-cover rounded-xl shadow-sm"
      />
      
      {/* Dark Mode Logo */}
      <Image
        src="/assets/logo-dark.jpeg" 
        alt="Joe Yoke Logo"
        fill
        sizes="42px"
        priority
        className="hidden dark:block object-cover rounded-xl shadow-sm"
      />
    </div>
  );
}