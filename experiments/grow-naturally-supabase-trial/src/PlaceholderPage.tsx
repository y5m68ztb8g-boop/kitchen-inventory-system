type PlaceholderPageProps = {
  title: string;
  description: string;
  backLabel: string;
};

export function PlaceholderPage({ title, description, backLabel }: PlaceholderPageProps) {
  return (
    <main className="placeholder-shell">
      <a className="back-link" href="#">
        {backLabel}
      </a>
      <section className="placeholder-panel">
        <h1>{title}</h1>
        <p>{description}</p>
      </section>
    </main>
  );
}
