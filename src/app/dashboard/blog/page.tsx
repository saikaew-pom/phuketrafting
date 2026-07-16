import Link from "next/link";
import { listAllPosts, categoryLabel } from "@/lib/queries/blog";
import { formatDateTime } from "@/lib/format";

export default async function BlogListPage() {
  const posts = await listAllPosts();

  return (
    <div>
      <h1>Blog</h1>
      <p>
        <Link href="/dashboard/blog/new">+ New post</Link>
      </p>
      <table style={{ borderCollapse: "collapse", width: "100%", marginTop: "16px" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
            <th style={{ padding: "8px" }}>Title</th>
            <th style={{ padding: "8px" }}>Category</th>
            <th style={{ padding: "8px" }}>Status</th>
            <th style={{ padding: "8px" }}>Updated</th>
            <th style={{ padding: "8px" }}></th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr key={post.id} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "8px" }}>
                {post.title}
                {post.featured === 1 && " ★"}
              </td>
              <td style={{ padding: "8px" }}>{categoryLabel(post.category)}</td>
              <td style={{ padding: "8px" }}>{post.is_published ? "Published" : "Draft"}</td>
              <td style={{ padding: "8px" }}>{formatDateTime(post.updated_at)}</td>
              <td style={{ padding: "8px" }}>
                <Link href={`/dashboard/blog/${post.id}`}>Edit</Link>
              </td>
            </tr>
          ))}
          {posts.length === 0 && (
            <tr>
              <td style={{ padding: "8px" }} colSpan={5}>
                No posts yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
