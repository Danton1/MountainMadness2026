import Image from "next/image";
function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
    if (avatarUrl) {
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <Image
          src={avatarUrl}
          alt={name}
          width={56}
          height={56}
          className="h-14 w-14 rounded-2xl object-cover border border-emerald-100 shadow-sm"
        />
      );
    }
    const initial = (name?.[0] ?? "U").toUpperCase();
    return (
      <div className="h-14 w-14 rounded-2xl bg-emerald-600 text-white font-bold flex items-center justify-center shadow-sm">
        {initial}
      </div>
    );
  }
  
  function MiniAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
    if (avatarUrl) {
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <Image
          src={avatarUrl}
          alt={name}
          width={32}
          height={32}
          className="h-8 w-8 rounded-xl object-cover border border-emerald-100"
        />
      );
    }
    const initial = (name?.[0] ?? "U").toUpperCase();
    return (
      <div className="h-8 w-8 rounded-xl bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">
        {initial}
      </div>
    );
  }

  export {Avatar, MiniAvatar}
