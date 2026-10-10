export function ModuleWorkspace({ title }: { title: string }) {
  return (
    <section className="module-workspace">
      <div className="module-workspace-heading">
        <div>
          <p className="eyebrow">School operations</p>
          <h1>{title}</h1>
          <p>This module is ready to connect to its domain service.</p>
        </div>
      </div>
    </section>
  );
}
