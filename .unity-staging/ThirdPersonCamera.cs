using UnityEngine;

public sealed class ThirdPersonCamera : MonoBehaviour
{
    [SerializeField] private Transform target;
    [SerializeField] private float distance = 4.4f;
    [SerializeField] private float height = 1.5f;
    [SerializeField] private float sensitivity = 0.12f;
    [SerializeField] private float smoothTime = 0.06f;

    private float yaw;
    private float pitch = 18f;
    private Vector3 smoothVelocity;

    public void SetTarget(Transform newTarget) => target = newTarget;

    private void Start()
    {
        yaw = transform.eulerAngles.y;
        Cursor.lockState = CursorLockMode.Locked;
        Cursor.visible = false;
    }

    private void LateUpdate()
    {
        if (target == null) return;

        yaw += Input.GetAxis("Mouse X") * sensitivity * 12f;
        pitch = Mathf.Clamp(pitch - Input.GetAxis("Mouse Y") * sensitivity * 12f, -15f, 65f);

        if (Input.GetKeyDown(KeyCode.Escape))
        {
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }

        bool aiming = Input.GetMouseButton(1);
        float activeDistance = aiming ? 2.35f : distance;
        float targetFov = aiming ? 48f : 65f;
        Camera camera = GetComponent<Camera>();
        if (camera != null) camera.fieldOfView = Mathf.Lerp(camera.fieldOfView, targetFov, Time.deltaTime * 10f);
        Quaternion rotation = Quaternion.Euler(pitch, yaw, 0f);
        Vector3 focus = target.position + Vector3.up * height;
        Vector3 desiredPosition = focus - rotation * Vector3.forward * activeDistance;
        Vector3 direction = desiredPosition - focus;
        if (Physics.SphereCast(focus, 0.22f, direction.normalized, out RaycastHit hit, direction.magnitude, ~0, QueryTriggerInteraction.Ignore))
            desiredPosition = focus + direction.normalized * Mathf.Max(hit.distance - 0.18f, 0.35f);
        transform.position = Vector3.SmoothDamp(transform.position, desiredPosition, ref smoothVelocity, smoothTime);
        transform.rotation = rotation;
    }
}
