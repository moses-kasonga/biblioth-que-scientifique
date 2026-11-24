import RecordContent from "@/components/record-content";
import LibraryShell from "@/components/library-shell";
export default async function RecordPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 return <LibraryShell section="record"><RecordContent recordId={id}/></LibraryShell>;
}
