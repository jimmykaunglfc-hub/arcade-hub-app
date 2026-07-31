
interface JoeYokeLogoProps {
  className?: string; 
}

export default function JoeYokeLogo({ className = "w-[42px] h-[42px]" }: JoeYokeLogoProps) {
  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      {/* Direct public URLs also work in Capacitor's static WebView bundle. */}
      <img
        src="/logo-light.jpeg"
        alt="Joe Yoke Logo"
        className="block dark:hidden w-full h-full object-cover rounded-xl shadow-sm"
      />
      <img
        src="/logo-dark.jpeg"
        alt="Joe Yoke Logo"
        className="hidden dark:block w-full h-full object-cover rounded-xl shadow-sm"
      />
    </div>
  );
}