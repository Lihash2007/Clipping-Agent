"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function EditorProjectRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  useEffect(() => {
    if (id) {
      router.replace(`/editor?project=${encodeURIComponent(id)}`);
    } else {
      router.replace("/library");
    }
  }, [id, router]);

  return (
    <div className="min-h-screen bg-[#0b0d11] flex flex-col items-center justify-center space-y-3 text-white">
      <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      <p className="text-xs font-mono text-gray-400">Loading Pro Studio Editor...</p>
    </div>
  );
}
