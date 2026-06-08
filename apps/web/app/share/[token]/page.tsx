import type { Metadata } from "next";
import SharedReader from "./SharedReader";

// Public capability link — keep it out of search indexes.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedReader token={token} />;
}
