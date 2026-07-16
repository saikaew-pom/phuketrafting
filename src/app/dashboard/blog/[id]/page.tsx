import { notFound } from "next/navigation";
import { getPost } from "@/lib/queries/blog";
import { saveBlogPost, deleteBlogPost } from "../actions";
import { BlogEditorClient } from "../BlogEditorClient";

export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) notFound();

  const saveWithId = saveBlogPost.bind(null, id);
  const deleteWithId = deleteBlogPost.bind(null, id);

  return (
    <div>
      <h1>{post.title}</h1>
      <BlogEditorClient post={post} action={saveWithId} onDelete={deleteWithId} />
    </div>
  );
}
