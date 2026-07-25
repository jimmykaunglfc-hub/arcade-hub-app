import Image from "next/image";

// 💡 Point directly to public/ since there is no assets folder
import logoLight from "../public/logo-light.jpeg";
import logoDark from "../public/logo-dark.jpeg";

interface JoeYokeLogoProps {
  className?: string; 
}

export default function JoeYokeLogo({ className = "w-[42px] h-[42px]" }: JoeYokeLogoProps) {
  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      {/* Light Mode Logo */}
      <Image
        src={logoLight} 
        alt="Joe Yoke Logo"
        priority
        className="block dark:hidden w-full h-full object-cover rounded-xl shadow-sm"
      />
      
      {/* Dark Mode Logo */}
      <Image
        src={logoDark} 
        alt="Joe Yoke Logo"
        priority
        className="hidden dark:block w-full h-full object-cover rounded-xl shadow-sm"
      />
    </div>
  );
}