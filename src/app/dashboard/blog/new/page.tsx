import { BlogEditorClient } from "../BlogEditorClient";
import { createBlogPost } from "../actions";

export default function NewBlogPostPage() {
  return (
    <div>
      <h1>New post</h1>
      <BlogEditorClient post={null} action={createBlogPost} />
    </div>
  );
}
