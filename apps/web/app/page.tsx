import { redirect } from 'next/navigation'

// The contractor web is mounted at reely.io/contractor (apex rewrite). Root → the club entry.
export default function RootPage() {
  redirect('/contractor')
}
