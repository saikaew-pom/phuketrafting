import { BlogEditorClient } from "../BlogEditorClient";
import { createBlogPost } from "../actions";

export default function NewBlogPostPage() {
  return (
    <div>
      <div className="pr-dash-head">
        <h1>New post</h1>
      </div>
      <BlogEditorClient post={null} action={createBlogPost} />
    </div>
  );
}
