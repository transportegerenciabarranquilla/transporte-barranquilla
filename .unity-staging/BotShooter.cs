using UnityEngine;

public sealed class BotShooter : MonoBehaviour
{
    [SerializeField] private float range = 22f;
    [SerializeField] private float fireInterval = 1.6f;
    [SerializeField] private int damage = 15;
    private Transform target;
    private float nextShot;

    private void Start()
    {
        GameObject player = GameObject.FindGameObjectWithTag("Player");
        if (player != null) target = player.transform;
    }

    private void Update()
    {
        if (target == null) return;
        Vector3 aimPoint = target.position + Vector3.up;
        Vector3 direction = aimPoint - (transform.position + Vector3.up);
        if (direction.sqrMagnitude > range * range) return;
        Vector3 flatDirection = new(direction.x, 0f, direction.z);
        if (flatDirection.sqrMagnitude > 0.01f) transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(flatDirection), 5f * Time.deltaTime);
        if (Time.time < nextShot) return;
        nextShot = Time.time + fireInterval;
        if (Physics.Raycast(transform.position + Vector3.up, direction.normalized, out RaycastHit hit, range, ~0, QueryTriggerInteraction.Ignore))
        {
            CombatHealth health = hit.collider.GetComponentInParent<CombatHealth>();
            if (health != null && health.transform == target) health.TakeDamage(damage);
        }
        Animator animator = GetComponentInChildren<Animator>();
        if (animator != null) animator.SetTrigger("Shoot");
    }
}
