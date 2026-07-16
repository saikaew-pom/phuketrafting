import Link from "next/link";
import { listAllPosts, categoryLabel } from "@/lib/queries/blog";
import { formatDateTime } from "@/lib/format";

export default async function BlogListPage() {
  const posts = await listAllPosts();

  return (
    <div>
      <div className="pr-dash-head">
        <h1>Blog</h1>
        <Link href="/dashboard/blog/new" className="pr-dash-btn">
          + New post
        </Link>
      </div>
      <div className="pr-dash-tablewrap">
        <table className="pr-dash-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              <th>Status</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id}>
                <td>
                  {post.title}
                  {post.featured === 1 && " ★"}
                </td>
                <td>{categoryLabel(post.category)}</td>
                <td>
                  <span className={"pr-dash-badge " + (post.is_published ? "pr-dash-badge-ok" : "pr-dash-badge-neutral")}>
                    {post.is_published ? "Published" : "Draft"}
                  </span>
                </td>
                <td>{formatDateTime(post.updated_at)}</td>
                <td>
                  <Link href={`/dashboard/blog/${post.id}`}>Edit</Link>
                </td>
              </tr>
            ))}
            {posts.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="pr-dash-empty">No posts yet.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
